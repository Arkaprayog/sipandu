#!/usr/bin/env python3
"""Patch Capgo's generated Android printer bridge for safe PDF storage and printing.

Capacitor runs plugin methods on its CapacitorPlugins thread. Android WebView
printing must create its PrintDocumentAdapter on the main thread. This patch
also keeps the WebView-backed print document alive until the print session
finishes, and adds an app-private PDF storage method for assessment exports.
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path


IMPORTS = (
    "import java.nio.charset.StandardCharsets;",
    "import java.util.Locale;",
    "import android.print.PrintJob;",
    "import java.util.concurrent.atomic.AtomicBoolean;",
    "import java.util.concurrent.atomic.AtomicReference;",
)

SAVE_PDF_METHOD = r'''
    /**
     * Persist a generated PDF in SIPANDU's private internal app storage.
     * Assessment PDFs can contain identity documents and sensitive case data;
     * they must not be written to the public Downloads directory.
     */
    public String savePdfToAppStorage(String data, String name) throws Exception {
        if (data == null || data.trim().isEmpty()) {
            throw new Exception("PDF data is required");
        }

        byte[] decodedData = Base64.decode(data, Base64.DEFAULT);
        if (decodedData.length < 5
                || !"%PDF-".equals(new String(decodedData, 0, 5, StandardCharsets.US_ASCII))) {
            throw new Exception("Invalid PDF data");
        }

        String safeName = name == null ? "" : name.trim();
        safeName = safeName.replaceAll("[^a-zA-Z0-9._-]", "_");
        if (safeName.isEmpty()) {
            safeName = "SIPANDU-Asesmen.pdf";
        }
        if (!safeName.toLowerCase(Locale.ROOT).endsWith(".pdf")) {
            safeName += ".pdf";
        }

        File directory = new File(context.getFilesDir(), "assessment-archives");
        if (!directory.exists() && !directory.mkdirs()) {
            throw new Exception("Unable to create private SIPANDU assessment storage");
        }

        File destination = new File(directory, safeName);
        File temporary = new File(directory, safeName + ".tmp");
        try {
            try (FileOutputStream output = new FileOutputStream(temporary, false)) {
                output.write(decodedData);
                output.flush();
                output.getFD().sync();
            }
            if (destination.exists() && !destination.delete()) {
                throw new Exception("Unable to replace the previous assessment PDF");
            }
            if (!temporary.renameTo(destination)) {
                throw new Exception("Unable to finalize the saved assessment PDF");
            }
        } catch (Exception error) {
            if (temporary.exists()) {
                temporary.delete();
            }
            throw error;
        }

        return Uri.fromFile(destination).toString();
    }
'''

PRINT_WEBVIEW_METHODS = r'''
    public void printWebView(WebView webView, String name) throws Exception {
        printWebView(webView, name, null);
    }

    /**
     * Create the WebView print adapter on Android's main thread. The callback
     * fires only after Android finishes or cancels the print session, so the
     * caller can safely keep its prepared assessment DOM mounted until then.
     */
    public void printWebView(WebView webView, String name, OnPrintFinishCallback callback) throws Exception {
        if (webView == null) {
            throw new Exception("WebView not available");
        }
        activity.runOnUiThread(
            new Runnable() {
                @Override
                public void run() {
                    try {
                        createWebPrintJob(webView, name, callback);
                    } catch (Exception error) {
                        if (callback != null) {
                            callback.onError(error.getMessage() == null
                                ? "Unable to start Android print job"
                                : error.getMessage());
                        }
                    }
                }
            }
        );
    }
'''

CREATE_WEB_PRINT_JOB_METHODS = r'''
    private void createWebPrintJob(WebView webView, String name) {
        try {
            createWebPrintJob(webView, name, null);
        } catch (Exception ignored) {
            // Existing fire-and-forget HTML printing remains backward compatible.
        }
    }

    private void createWebPrintJob(WebView webView, String name, OnPrintFinishCallback callback) throws Exception {
        PrintManager printManager = (PrintManager) context.getSystemService(Context.PRINT_SERVICE);
        if (printManager == null) {
            throw new Exception("Print service not available");
        }

        // createPrintDocumentAdapter() is a WebView method and must run on the UI thread.
        PrintDocumentAdapter printAdapter = webView.createPrintDocumentAdapter(name);
        if (callback == null) {
            printManager.print(name, printAdapter, new PrintAttributes.Builder().build());
            return;
        }

        AtomicReference<PrintJob> printJob = new AtomicReference<>();
        PrintDocumentAdapter proxy = new PrintFinishAdapter(printAdapter, () -> {
            PrintJob job = printJob.get();
            if (job != null && job.isFailed()) {
                callback.onError("Android print job failed");
                return;
            }
            callback.onFinish();
        });

        PrintJob job = printManager.print(name, proxy, new PrintAttributes.Builder().build());
        if (job == null) {
            callback.onError("Android could not start the print dialog");
            return;
        }
        printJob.set(job);
    }
'''

PRINT_FINISH_ADAPTER = r'''
    /**
     * Forward the WebView print adapter callbacks and notify JavaScript after
     * Android no longer needs the live WebView document.
     */
    private static class PrintFinishAdapter extends PrintDocumentAdapter {
        private final PrintDocumentAdapter delegate;
        private final Runnable onFinished;
        private final AtomicBoolean notified = new AtomicBoolean(false);

        PrintFinishAdapter(@NonNull PrintDocumentAdapter delegate, @NonNull Runnable onFinished) {
            this.delegate = delegate;
            this.onFinished = onFinished;
        }

        @Override
        public void onStart() {
            delegate.onStart();
        }

        @Override
        public void onLayout(
            PrintAttributes oldAttributes,
            PrintAttributes newAttributes,
            CancellationSignal cancellationSignal,
            LayoutResultCallback callback,
            Bundle extras
        ) {
            delegate.onLayout(oldAttributes, newAttributes, cancellationSignal, callback, extras);
        }

        @Override
        public void onWrite(
            PageRange[] pages,
            ParcelFileDescriptor destination,
            CancellationSignal cancellationSignal,
            WriteResultCallback callback
        ) {
            delegate.onWrite(pages, destination, cancellationSignal, callback);
        }

        @Override
        public void onFinish() {
            try {
                delegate.onFinish();
            } finally {
                if (notified.compareAndSet(false, true)) {
                    onFinished.run();
                }
            }
        }
    }
'''

SAVE_PDF_PLUGIN_METHOD = r'''
    @PluginMethod
    public void savePdfToAppStorage(PluginCall call) {
        String data = call.getString("data");
        String name = call.getString("name", "SIPANDU-Asesmen.pdf");
        if (data == null || data.trim().isEmpty()) {
            call.reject("PDF data is required");
            return;
        }

        try {
            String uri = implementation.savePdfToAppStorage(data, name);
            JSObject result = new JSObject();
            result.put("uri", uri);
            result.put("name", name);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Failed to save assessment PDF in private app storage: " + error.getMessage(), error);
        }
    }
'''

PRINT_WEBVIEW_PLUGIN_METHOD = r'''
    @PluginMethod
    public void printWebView(PluginCall call) {
        String name = call.getString("name", "Document");
        try {
            implementation.printWebView(
                getBridge().getWebView(),
                name,
                new Printer.OnPrintFinishCallback() {
                    @Override
                    public void onFinish() {
                        // Resolve after print/cancel so the prepared A4 DOM remains available.
                        call.resolve();
                    }

                    @Override
                    public void onError(String message) {
                        call.reject("Failed to print web view: " + message);
                    }
                }
            );
        } catch (Exception error) {
            call.reject("Failed to print web view: " + error.getMessage(), error);
        }
    }
'''


def replace_java_method(source: str, signature: str, replacement: str, label: str) -> str:
    match = re.search(signature, source, re.MULTILINE)
    if not match:
        raise RuntimeError(f"Could not find Java method: {label}")
    opening = source.find("{", match.start())
    if opening < 0:
        raise RuntimeError(f"Could not find opening brace for: {label}")

    depth = 0
    closing = -1
    for index in range(opening, len(source)):
        char = source[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                closing = index + 1
                break
    if closing < 0:
        raise RuntimeError(f"Could not find closing brace for: {label}")

    return source[:match.start()] + replacement.strip("\n") + source[closing:]


def ensure_imports(source: str) -> str:
    package = re.search(r"(?m)^package\s+[\w.]+\s*;\s*", source)
    if not package:
        raise RuntimeError("Printer.java is missing its Java package declaration")
    missing = [item for item in IMPORTS if item not in source]
    if not missing:
        return source
    return source[:package.end()] + "\n" + "\n".join(missing) + "\n" + source[package.end():]


def patch_printer_source(source: str) -> str:
    if "public class Printer {" not in source:
        raise RuntimeError("Unexpected Capgo Printer.java; class declaration not found")

    source = ensure_imports(source)

    if "public interface OnPrintFinishCallback" not in source:
        class_marker = "public class Printer {"
        interface = r'''
    public interface OnPrintFinishCallback {
        void onFinish();
        void onError(String message);
    }

'''
        source = source.replace(class_marker, class_marker + interface, 1)

    if "public String savePdfToAppStorage(" not in source:
        marker = "    public void printBase64("
        if marker not in source:
            raise RuntimeError("Could not find Printer.printBase64 insertion point")
        source = source.replace(marker, SAVE_PDF_METHOD + "\n" + marker, 1)

    if "public void printWebView(WebView webView, String name, OnPrintFinishCallback callback)" not in source:
        source = replace_java_method(
            source,
            r"public\s+void\s+printWebView\s*\(\s*WebView\s+webView\s*,\s*String\s+name\s*\)\s*throws\s+Exception",
            PRINT_WEBVIEW_METHODS,
            "Printer.printWebView",
        )

    if "private void createWebPrintJob(WebView webView, String name, OnPrintFinishCallback callback)" not in source:
        source = replace_java_method(
            source,
            r"private\s+void\s+createWebPrintJob\s*\(\s*WebView\s+webView\s*,\s*String\s+name\s*\)",
            CREATE_WEB_PRINT_JOB_METHODS,
            "Printer.createWebPrintJob",
        )

    if "private static class PrintFinishAdapter extends PrintDocumentAdapter" not in source:
        marker = "    // Custom PrintDocumentAdapter for PDF files"
        if marker not in source:
            raise RuntimeError("Could not find PrintDocumentAdapter insertion point")
        source = source.replace(marker, PRINT_FINISH_ADAPTER + "\n" + marker, 1)

    required = (
        "public String savePdfToAppStorage(",
        "public interface OnPrintFinishCallback",
        "activity.runOnUiThread(",
        "webView.createPrintDocumentAdapter(name)",
        "new PrintFinishAdapter(",
    )
    missing = [item for item in required if item not in source]
    if missing:
        raise RuntimeError("Printer.java patch verification failed: " + ", ".join(missing))
    return source


def patch_plugin_source(source: str) -> str:
    if "public class PrinterPlugin extends Plugin" not in source:
        raise RuntimeError("Unexpected Capgo PrinterPlugin.java; class declaration not found")

    if "public void savePdfToAppStorage(PluginCall call)" not in source:
        marker = "    @PluginMethod\n    public void printWebView(PluginCall call)"
        if marker not in source:
            raise RuntimeError("Could not find PrinterPlugin.printWebView insertion point")
        source = source.replace(marker, SAVE_PDF_PLUGIN_METHOD + "\n" + marker, 1)

    if "new Printer.OnPrintFinishCallback()" not in source:
        source = replace_java_method(
            source,
            r"public\s+void\s+printWebView\s*\(\s*PluginCall\s+call\s*\)",
            PRINT_WEBVIEW_PLUGIN_METHOD,
            "PrinterPlugin.printWebView",
        )

    required = (
        "public void savePdfToAppStorage(PluginCall call)",
        "new Printer.OnPrintFinishCallback()",
        "call.resolve();",
        "call.reject(\"Failed to print web view: \" + message)",
    )
    missing = [item for item in required if item not in source]
    if missing:
        raise RuntimeError("PrinterPlugin.java patch verification failed: " + ", ".join(missing))
    return source


def patch_android_project(project: Path) -> tuple[Path, Path]:
    printer_files = [
        path for path in project.rglob("Printer.java")
        if path.as_posix().endswith("/com/capgo/printer/Printer.java")
    ]
    plugin_files = [
        path for path in project.rglob("PrinterPlugin.java")
        if path.as_posix().endswith("/com/capgo/printer/PrinterPlugin.java")
    ]
    if len(printer_files) != 1 or len(plugin_files) != 1:
        raise RuntimeError(
            "Expected exactly one generated Capgo printer implementation and plugin, "
            f"found Printer.java={len(printer_files)}, PrinterPlugin.java={len(plugin_files)}"
        )

    printer_path = printer_files[0]
    plugin_path = plugin_files[0]
    patched_printer = patch_printer_source(printer_path.read_text(encoding="utf-8"))
    patched_plugin = patch_plugin_source(plugin_path.read_text(encoding="utf-8"))
    printer_path.write_text(patched_printer, encoding="utf-8")
    plugin_path.write_text(patched_plugin, encoding="utf-8")
    return printer_path, plugin_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, default=Path("android"), help="Generated Capacitor Android project")
    args = parser.parse_args()
    if not args.project.is_dir():
        parser.error(f"Android project directory does not exist: {args.project}")

    printer, plugin = patch_android_project(args.project)
    print("Verified native assessment PDF storage and UI-thread print lifecycle:")
    print(f"- {printer}")
    print(f"- {plugin}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

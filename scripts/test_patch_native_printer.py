#!/usr/bin/env python3
"""Regression tests for the generated Capgo Android printer patch."""
from pathlib import Path
import sys
import tempfile
import unittest
import re

sys.path.insert(0, str(Path(__file__).resolve().parent))
from patch_native_printer import patch_android_project


PRINTER_FIXTURE = r'''package com.capgo.printer;

import android.app.Activity;
import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

public class Printer {
    private final Context context;
    private final Activity activity;

    public Printer(Context context, Activity activity) {
        this.context = context;
        this.activity = activity;
    }

    public void printBase64(String data, String mimeType, String name) throws Exception {}
    public void printFile(String path, String mimeType, String name) throws Exception {}

    public void printWebView(WebView webView, String name) throws Exception {
        if (webView == null) {
            throw new Exception("WebView not available");
        }
        createWebPrintJob(webView, name);
    }

    private void createWebPrintJob(WebView webView, String name) {
        PrintManager printManager = (PrintManager) context.getSystemService(Context.PRINT_SERVICE);
        if (printManager == null) {
            return;
        }
        PrintDocumentAdapter printAdapter = webView.createPrintDocumentAdapter(name);
        printManager.print(name, printAdapter, new PrintAttributes.Builder().build());
    }

    // Custom PrintDocumentAdapter for PDF files
    private class PdfDocumentAdapter extends PrintDocumentAdapter {}
}
'''

PLUGIN_FIXTURE = r'''package com.capgo.printer;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Printer")
public class PrinterPlugin extends Plugin {
    private Printer implementation;

    @PluginMethod
    public void printFile(PluginCall call) {
        String path = call.getString("path");
        String mimeType = call.getString("mimeType");
        String name = call.getString("name", "Document");
        try {
            implementation.printFile(path, mimeType, name);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to print file: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void printWebView(PluginCall call) {
        String name = call.getString("name", "Document");
        try {
            implementation.printWebView(getBridge().getWebView(), name);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to print web view: " + e.getMessage(), e);
        }
    }
}
'''


class NativePrinterPatchTests(unittest.TestCase):
    def test_patches_print_thread_lifecycle_and_private_pdf_storage(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            project = root / "android"
            project.mkdir(parents=True)
            package = root / "node_modules" / "@capgo" / "capacitor-printer" / "android" / "src" / "main" / "java" / "com" / "capgo" / "printer"
            package.mkdir(parents=True)
            (package / "Printer.java").write_text(PRINTER_FIXTURE, encoding="utf-8")
            (package / "PrinterPlugin.java").write_text(PLUGIN_FIXTURE, encoding="utf-8")

            printer_path, plugin_path = patch_android_project(project)
            printer = printer_path.read_text(encoding="utf-8")
            plugin = plugin_path.read_text(encoding="utf-8")

            self.assertIn("savePdfToAppStorage", printer)
            self.assertIn("context.getFilesDir()", printer)
            self.assertIn("activity.runOnUiThread(", printer)
            self.assertIn("webView.createPrintDocumentAdapter(name)", printer)
            self.assertIn("new PrintFinishAdapter(", printer)
            self.assertIn("AtomicBoolean", printer)
            self.assertIn("new Printer.OnPrintFinishCallback()", plugin)
            self.assertIn("new Printer.OnPrintStartCallback()", plugin)
            self.assertIn('call.reject("Failed to print file: " + message)', plugin)
            self.assertEqual(
                len(re.findall(r"@PluginMethod\\s+public\\s+void\\s+printFile\\s*\\(\\s*PluginCall\\s+call\\s*\\)", plugin)),
                1,
            )
            self.assertEqual(
                len(re.findall(r"@PluginMethod\\s+public\\s+void\\s+printWebView\\s*\\(\\s*PluginCall\\s+call\\s*\\)", plugin)),
                1,
            )
            self.assertIn("activity.runOnUiThread(", printer)
            self.assertIn("implementation.savePdfToAppStorage(data, name)", plugin)
            self.assertIn("call.resolve();", plugin)

            first_printer = printer_path.read_text(encoding="utf-8")
            first_plugin = plugin_path.read_text(encoding="utf-8")
            patch_android_project(root)
            self.assertEqual(first_printer, printer_path.read_text(encoding="utf-8"))
            self.assertEqual(first_plugin, plugin_path.read_text(encoding="utf-8"))

    def test_private_storage_avoids_public_downloads_media_store(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            project = root / "android"
            project.mkdir(parents=True)
            package = root / "node_modules" / "@capgo" / "capacitor-printer" / "android" / "src" / "main" / "java" / "com" / "capgo" / "printer"
            package.mkdir(parents=True)
            (package / "Printer.java").write_text(PRINTER_FIXTURE, encoding="utf-8")
            (package / "PrinterPlugin.java").write_text(PLUGIN_FIXTURE, encoding="utf-8")
            printer_path, _ = patch_android_project(project)
            source = printer_path.read_text(encoding="utf-8")
            self.assertIn('new File(context.getFilesDir(), "assessment-archives")', source)
            self.assertNotIn("MediaStore.Downloads", source)


if __name__ == "__main__":
    unittest.main(verbosity=2)

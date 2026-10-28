#!/usr/bin/env python3
"""Patch generated Capacitor MainActivity for Capgo Google API scope authorization."""
from pathlib import Path
import re

candidates = list(Path("android/app/src/main/java").rglob("MainActivity.java"))
if len(candidates) != 1:
    raise SystemExit(f"Expected exactly one generated MainActivity.java, found {len(candidates)}")
path = candidates[0]
source = path.read_text()
if "ModifiedMainActivityForSocialLoginPlugin" in source:
    print(f"Native Google authorization bridge already configured: {path}")
    raise SystemExit(0)

imports = """import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.Plugin;
import android.content.Intent;
import android.util.Log;
"""
package_match = re.search(r"^package [^;]+;\s*", source, re.MULTILINE)
if not package_match:
    raise SystemExit(f"Cannot find Java package declaration in {path}")
source = source[:package_match.end()] + "\n" + imports + source[package_match.end():]
source, count = re.subn(
    r"public class MainActivity extends BridgeActivity\s*\{",
    "public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {",
    source,
    count=1,
)
if count != 1:
    raise SystemExit(f"Cannot patch MainActivity class declaration in {path}")
methods = """
    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
                && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
            if (pluginHandle == null) {
                Log.i("Google Activity Result", "SocialLogin login handle is null");
                return;
            }
            Plugin plugin = pluginHandle.getInstance();
            if (!(plugin instanceof SocialLoginPlugin)) {
                Log.i("Google Activity Result", "SocialLogin login handle is not SocialLoginPlugin");
                return;
            }
            ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
        }
    }

    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}
"""
last_brace = source.rfind("}")
if last_brace < 0:
    raise SystemExit(f"Cannot find closing class brace in {path}")
source = source[:last_brace] + methods + "\n" + source[last_brace:]
path.write_text(source)
print(f"Configured native Google authorization callback: {path}")

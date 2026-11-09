from pathlib import Path
import re

wrapper = Path("android/gradle/wrapper/gradle-wrapper.properties")
if not wrapper.is_file():
    raise SystemExit("Generated Gradle wrapper properties were not found.")

content = wrapper.read_text(encoding="utf-8")
match = re.search(r"(?m)^distributionUrl=(.+)$", content)
if not match:
    raise SystemExit("Gradle distributionUrl is missing from generated wrapper.")

url = match.group(1).replace(r"\:", ":")
# Avoid the services.gradle.org redirect to GitHub release assets, which can
# intermittently return HTTP 504 on hosted CI runners.
url = re.sub(r"^https://services\\.gradle\\.org/distributions/", "https://downloads.gradle.org/distributions/", url)
if url.endswith("-all.zip"):
    url = url[:-len("-all.zip")] + "-bin.zip"
elif not url.endswith("-bin.zip"):
    raise SystemExit("Unexpected Gradle distribution URL: " + url)

if not re.search(r"(?m)^networkTimeout=", content):
    content = content.rstrip() + "\nnetworkTimeout=120000\n"
else:
    content = re.sub(r"(?m)^networkTimeout=\d+$", "networkTimeout=120000", content)

content = re.sub(r"(?m)^distributionUrl=.+$", "distributionUrl=" + url.replace(":", r"\:"), content)
wrapper.write_text(content, encoding="utf-8")
print("Configured Gradle wrapper:", url, "with networkTimeout=300000 ms")

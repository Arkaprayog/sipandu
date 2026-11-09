from pathlib import Path
import re

wrapper = Path("android/gradle/wrapper/gradle-wrapper.properties")
if not wrapper.is_file():
    raise SystemExit("Generated Gradle wrapper properties were not found.")

content = wrapper.read_text(encoding="utf-8")
match = re.search(r"(?m)^distributionUrl=(.+)$", content)
if not match:
    raise SystemExit("Gradle distributionUrl is missing from generated wrapper.")

original_url = match.group(1).replace(r"\\:", ":")
filename = Path(original_url).name
if filename.endswith("-all.zip"):
    filename = filename[:-len("-all.zip")] + "-bin.zip"
if not re.fullmatch(r"gradle-[0-9]+\\.[0-9]+\\.[0-9]+-bin\\.zip", filename):
    raise SystemExit("Unexpected Gradle distribution filename: " + filename)

version = filename[len("gradle-"):-len("-bin.zip")]
# Pin the mirror artifact to the official Gradle SHA-256. This avoids the
# services.gradle.org -> GitHub release redirect that returns HTTP 504 in CI.
official_checksums = {
    "8.11.1": "f397b287023acdba1e9f6fc5ea72d22dd63669d59ed4a289a29b1a76eee151c6",
}
checksum = official_checksums.get(version)
if not checksum:
    raise SystemExit("No independently sourced official Gradle checksum is configured for " + version)

url = f"https://mirrors.aliyun.com/gradle/distributions/v{version}/{filename}"

if not re.search(r"(?m)^networkTimeout=", content):
    content = content.rstrip() + "\\nnetworkTimeout=300000\\n"
else:
    content = re.sub(r"(?m)^networkTimeout=\\d+$", "networkTimeout=300000", content)

if not re.search(r"(?m)^distributionSha256Sum=", content):
    content = content.rstrip() + "\\ndistributionSha256Sum=" + checksum + "\\n"
else:
    content = re.sub(r"(?m)^distributionSha256Sum=.*$", "distributionSha256Sum=" + checksum, content)

content = re.sub(r"(?m)^distributionUrl=.+$", "distributionUrl=" + url.replace(":", r"\\:"), content)
wrapper.write_text(content, encoding="utf-8")
print("Configured checksum-verified Gradle distribution:", url)
print("Official Gradle SHA-256:", checksum)
print("Gradle network timeout: 300000 ms")

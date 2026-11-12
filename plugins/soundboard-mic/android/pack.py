import json
import os
import shutil
import subprocess
import zipfile
from pathlib import Path

here = Path(__file__).resolve().parent
plugin = here.parent
out = plugin / "build" / "pack"
sdk = Path(os.environ["ANDROID_HOME"])
d8 = str(sdk / "build-tools" / "36.0.0" / "d8.bat")
android = str(sdk / "platforms" / "android-37.0" / "android.jar")

shutil.rmtree(out, ignore_errors=True)
(out / "dist").mkdir(parents=True)

classes = here / "build/intermediates/aar_main_jar/release/syncReleaseLibJars/classes.jar"
subprocess.run(
    [d8, "--release", "--min-api", "28", "--lib", android, "--output", str(out / "dist" / "loader.jar"), str(classes)],
    check=True,
    shell=False,
)

shutil.copy(plugin / "manifest.json", out / "dist" / "manifest.json")
if (plugin / "assets").is_dir():
    shutil.copytree(plugin / "assets", out / "dist" / "assets")
shutil.copy(plugin / "build" / "js" / "index.js", out / "dist" / "index.js")

version = json.loads((plugin / "manifest.json").read_text())["version"]
target = plugin / "build" / f"mlemception.soundboardmic@{version}.zip"
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for path in sorted((out / "dist").rglob("*")):
        if path.is_file():
            z.write(path, path.relative_to(out / "dist").as_posix())
print(target, target.stat().st_size)

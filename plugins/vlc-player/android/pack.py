import hashlib
import json
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

here = Path(__file__).resolve().parent
plugin = here.parent
out = plugin / "build" / "pack"
sdk = Path(os.environ["ANDROID_HOME"])
d8 = str(sdk / "build-tools" / "36.0.0" / "d8.bat")
android = str(sdk / "platforms" / "android-37.0" / "android.jar")
aar = Path(sys.argv[1])
release = "--release" in sys.argv
abis = [a for a in sys.argv[2:] if a != "--release"] or ["arm64-v8a", "armeabi-v7a", "x86_64"]
tag = "https://github.com/mlemception/mlem-plugins/releases/download/vlc-engine-3.7.7"

shutil.rmtree(out, ignore_errors=True)
out.mkdir(parents=True)

with zipfile.ZipFile(aar) as z:
    (out / "vlc.jar").write_bytes(z.read("classes.jar"))
    for abi in abis:
        for lib in ("libc++_shared.so", "libvlc.so", "libvlcjni.so"):
            path = out / "dist" / "jni" / abi / lib
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(z.read(f"jni/{abi}/{lib}"))

classes = here / "build/intermediates/aar_main_jar/release/syncReleaseLibJars/classes.jar"
loader = out / "loader-in.jar"
engine = out / "engine-in.jar"
with zipfile.ZipFile(classes) as z, zipfile.ZipFile(loader, "w") as a, zipfile.ZipFile(engine, "w") as b:
    for name in z.namelist():
        if not name.endswith(".class"):
            continue
        (b if name.startswith("mlem/vlc/engine/") else a).writestr(name, z.read(name))


def dex(name, *inputs):
    subprocess.run(
        [d8, "--release", "--min-api", "24", "--lib", android, "--classpath", str(classes),
         "--classpath", str(out / "vlc.jar"), "--output", str(out / "dist" / name), *map(str, inputs)],
        check=True,
        shell=False,
    )


dist = out / "dist"
dex("loader.jar", loader)
dex("engine.jar", engine, out / "vlc.jar")
if release:
    engines = plugin / "build" / "engine"
    shutil.rmtree(engines, ignore_errors=True)
    engines.mkdir()
    info = {}
    for abi in abis:
        zip_path = engines / f"vlc-engine-{abi}.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for lib in sorted((dist / "jni" / abi).iterdir()):
                z.write(lib, lib.name)
        info[abi] = {
            "url": f"{tag}/{zip_path.name}",
            "sha256": hashlib.sha256(zip_path.read_bytes()).hexdigest(),
        }
    shutil.rmtree(dist / "jni")
    (dist / "engine.json").write_text(json.dumps(info))

shutil.copy(plugin / "manifest.json", dist / "manifest.json")
shutil.copy(plugin / "build" / "js" / "index.js", dist / "index.js")

version = json.loads((plugin / "manifest.json").read_text())["version"]
target = plugin / "build" / f"mlemception.vlcplayer@{version}.zip"
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for path in sorted(dist.rglob("*")):
        if path.is_file():
            z.write(path, path.relative_to(dist).as_posix())
print(target, target.stat().st_size)

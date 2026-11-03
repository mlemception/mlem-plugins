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

libs = []
for dep in sorted((here / "build" / "bundle").iterdir()):
    if dep.suffix == ".aar":
        with zipfile.ZipFile(dep) as z:
            if "classes.jar" not in z.namelist():
                continue
            jar = out / f"{dep.stem}.jar"
            jar.write_bytes(z.read("classes.jar"))
            libs.append(jar)
    elif dep.suffix == ".jar":
        libs.append(dep)

shell = here / "shell" / "build" / "intermediates"
libs.append(shell / "compile_and_runtime_r_class_jar/debug/processDebugResources/R.jar")
shutil.copy(
    shell / "linked_resources_binary_format/debug/processDebugResources/linked-resources-binary-format-debug.ap_",
    out / "dist" / "res.apk",
)

classes = here / "build/intermediates/aar_main_jar/release/syncReleaseLibJars/classes.jar"
loader = out / "loader-in.jar"
engine = out / "engine-in.jar"
with zipfile.ZipFile(classes) as z, zipfile.ZipFile(loader, "w") as a, zipfile.ZipFile(engine, "w") as b:
    for name in z.namelist():
        if not name.endswith(".class"):
            continue
        (b if name.startswith("mlem/nocomp/engine/") else a).writestr(name, z.read(name))


def dex(name, *inputs, extra=()):
    subprocess.run(
        [d8, "--release", "--min-api", "24", "--lib", android, "--classpath", str(classes), *extra,
         "--output", str(out / "dist" / name), *map(str, inputs)],
        check=True,
        shell=False,
    )


dex("loader.jar", loader)
dex("engine.jar", engine, *libs)

shutil.copy(plugin / "manifest.json", out / "dist" / "manifest.json")
shutil.copy(plugin / "build" / "js" / "index.js", out / "dist" / "index.js")

version = json.loads((plugin / "manifest.json").read_text())["version"]
target = plugin / "build" / f"mlemception.nocompression@{version}.zip"
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for path in sorted((out / "dist").rglob("*")):
        if path.is_file():
            z.write(path, path.relative_to(out / "dist").as_posix())
print(target, target.stat().st_size)

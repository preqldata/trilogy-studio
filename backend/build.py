import os
import shutil
import subprocess
import sys
from pathlib import Path
from os import environ
from platform import system

# Get the root directory of the project
root = Path(__file__).parent

base = root.parent

SCRIPT_NAME = "trilogy-studio-engine"

if system() == "Linux":
    parent = "bin"
    final_file = SCRIPT_NAME
else:
    parent = "scripts"
    final_file = f"{SCRIPT_NAME}.exe"

ci_python = os.environ.get("pythonLocation")
pyenv_env = os.environ.get("pyenv")
virtual_env_path = environ.get("VIRTUAL_ENV", f"{base}/.venv")


if pyenv_env:
    python_path = Path(pyenv_env) / "bin" / "python"
    pyinstaller_path = Path(pyenv_env) / parent / "pyinstaller"
elif ci_python:
    python_path = Path(ci_python) / "python"
    pyinstaller_path = Path(ci_python) / parent / "pyinstaller"
else:
    python_path = Path(virtual_env_path) / parent / "python"
    pyinstaller_path = Path(virtual_env_path) / parent / "pyinstaller"

ci_requirements = root / "requirements-ci.txt"
requirements = root / "requirements.txt"

if __name__ == "__main__":
    print(f"{python_path}/{parent}/python")

    prefixes: list[str] = []
    # Command to execute
    setup_command = prefixes + [
        f"{python_path}",
        "-m",
        "pip",
        "install",
        "-r",
        f"{ci_requirements}",
    ]
    try:
        subprocess.check_call(setup_command, cwd=root)
    except subprocess.CalledProcessError as e:
        print("Error executing dev requirements install command:", e)
        sys.exit(1)
    req_command = prefixes + [
        f"{python_path}",
        "-m",
        "pip",
        "install",
        "-r" f"{requirements}",
    ]
    try:
        subprocess.check_call(req_command, cwd=root)
    except subprocess.CalledProcessError as e:
        print("Error executing requirements install command:", e)
        sys.exit(1)
    command = prefixes + [
        f"{pyinstaller_path}",
        "trilogy-studio-engine.spec",
        # "--noconsole",
        # "--onefile",
        # "--collect-all",
        # "uvicorn",
        # "--collect-all",
        # "duckdb",
        # "--collect-all",
        # "duckdb-engine",
        # "--noconfirm",
        # "--clean",
        # "--additional-hooks-dir",
        # "extra-hooks",
    ]

    try:
        subprocess.check_call(command, cwd=root)
    except subprocess.CalledProcessError as e:
        print("Error executing pyinstaller command:", e)
        sys.exit(1)

    # Move the executable to the root directory
    # Create the destination folder if it doesn't exist

    pyinstaller_output_file = root / "dist" / final_file
    # Copy the PyInstaller output file to the destination folder

    if not os.environ.get("in-ci"):
        print("copying to target")
        destination_folder = base / "frontend" / "public"
        os.makedirs(destination_folder, exist_ok=True)
        print(f"copying to final location {destination_folder}")
        shutil.copy(pyinstaller_output_file, destination_folder)
        print(f"file {pyinstaller_output_file} copied")

    print("checking file runs")
    my_env = os.environ.copy()
    my_env["in-ci"] = "true"
    subprocess.check_call([pyinstaller_output_file, "test"], env=my_env)

    print("Verified package ran basic tests and exited 0")

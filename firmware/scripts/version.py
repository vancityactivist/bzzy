# PlatformIO pre-build script: bakes the firmware version and board name into the build.
#
# The release workflow sets BZZY_FW_VERSION (e.g. "0.2.0") from the git tag. Anything
# you build yourself without it is version "dev": a test build, which never updates
# itself unless you press "Update now" in the app. See docs/ota.md.
import os

Import("env")  # noqa: F821 (provided by PlatformIO)

version = os.environ.get("BZZY_FW_VERSION", "").strip() or "dev"
board = env["PIOENV"]  # noqa: F821

env.Append(  # noqa: F821
    CPPDEFINES=[
        ("BZZY_FW_VERSION", env.StringifyMacro(version)),  # noqa: F821
        ("BZZY_BOARD_NAME", env.StringifyMacro(board)),  # noqa: F821
    ]
)
print(f"bzzy firmware {version} for {board}")

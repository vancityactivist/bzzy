# PlatformIO pre-build script: flash a bootloader that skips the XMC flash startup check.
#
# Some ESP32-S3-DevKitC-1 clones carry XMC flash with JEDEC ID 20 70 18, which is not on
# the ESP-IDF bootloader's list of known XMC parts (20 40 xx, 20 41 xx, 20 50 xx). The
# stock Arduino bootloader then runs its XMC "startup flow", re-reads the ID, still
# doesn't recognise it, logs "XMC flash startup fail" on UART0 and calls
# bootloader_reset(). On the native USB port all you see is the ROM banner repeating
# with rst:0x3 (RTC_SW_SYS_RST). esptool prints the same diagnosis when it connects:
# "XMC flash chip boot-up failure detected ... boot-up fix failed".
#
# The flash itself reads and writes fine, so this script copies the framework's
# bootloader ELF, makes bootloader_flash_xmc_startup() return ESP_OK straight away,
# converts it with the same esptool arguments PlatformIO would use, and points the
# build at the result through build.arduino.custom_bootloader.
import os
import shutil
import subprocess

from elftools.elf.elffile import ELFFile

Import("env")  # noqa: F821 (provided by PlatformIO)

SYMBOL = "bootloader_flash_xmc_startup"
ENTRY = bytes([0x36, 0x41, 0x00])  # entry a1, 32
RETURN_OK = bytes([0x0C, 0x02, 0x1D, 0xF0])  # movi.n a2, 0 ; retw.n

board = env.BoardConfig()
mcu = board.get("build.mcu", "esp32s3")
framework_dir = env.PioPlatform().get_package_dir("framework-arduinoespressif32")
build_dir = env.subst("$BUILD_DIR")


def normalize_freq(value):
    value = str(value).rstrip("L")
    return "%dm" % (int(value) // 1000000) if value.isdigit() else value


memory_type = board.get("build.arduino.memory_type", "")
flash_mode = board.get("build.flash_mode", "dio")
boot_mode = "opi" if memory_type in ("opi_opi", "opi_qspi") else board.get("build.boot", flash_mode)
if memory_type in ("opi_opi", "opi_qspi"):
    header_mode = "dout"
elif flash_mode in ("qio", "qout"):
    header_mode = "dio"
else:
    header_mode = flash_mode
freq = normalize_freq(board.get("build.f_flash", "80000000L"))
size = board.get("upload.flash_size", "4MB")

src_elf = os.path.join(framework_dir, "tools", "sdk", mcu, "bin", "bootloader_%s_%s.elf" % (boot_mode, freq))
patched_elf = os.path.join(build_dir, "bootloader_xmcfix.elf")
patched_bin = os.path.join(build_dir, "bootloader_xmcfix.bin")

os.makedirs(build_dir, exist_ok=True)
shutil.copyfile(src_elf, patched_elf)

with open(patched_elf, "r+b") as f:
    elf = ELFFile(f)
    sym = elf.get_section_by_name(".symtab").get_symbol_by_name(SYMBOL)
    if not sym:
        env.Exit("xmc_bootloader: %s not found in %s" % (SYMBOL, src_elf))
    addr = sym[0]["st_value"]
    offset = None
    for section in elf.iter_sections():
        start = section["sh_addr"]
        if section["sh_type"] == "SHT_PROGBITS" and start <= addr < start + section["sh_size"]:
            offset = section["sh_offset"] + addr - start
            break
    if offset is None:
        env.Exit("xmc_bootloader: no section holds %s" % SYMBOL)
    f.seek(offset)
    if f.read(3) != ENTRY:
        env.Exit("xmc_bootloader: unexpected code at %s in %s" % (SYMBOL, src_elf))
    f.write(RETURN_OK)

subprocess.check_call([
    env.subst("$PYTHONEXE"),
    os.path.join(env.PioPlatform().get_package_dir("tool-esptoolpy"), "esptool.py"),
    "--chip", mcu, "elf2image",
    "--flash_mode", header_mode,
    "--flash_freq", freq,
    "--flash_size", size,
    "-o", patched_bin,
    patched_elf,
], stdout=subprocess.DEVNULL)

board.update("build.arduino.custom_bootloader", patched_bin)
print("xmc_bootloader: using %s (from %s, XMC startup check skipped)" % (patched_bin, os.path.basename(src_elf)))

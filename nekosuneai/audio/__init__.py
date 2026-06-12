"""Audio capture and playback."""


def coerce_device(value):
    """Normalize a config device value for sounddevice.

    sounddevice treats a *string* as a device-name substring to match, which
    is ambiguous on Windows (e.g. "1" matches "Mic 1", "Line 1", "S/PDIF 1"
    and raises "Multiple input devices found"). Device indices must be ints.
    Empty / None means "system default".
    """
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    text = str(value).strip()
    if text == "":
        return None
    if text.lstrip("-").isdigit():
        return int(text)
    # A genuine device-name string was given; pass it through.
    return text

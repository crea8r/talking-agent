export function openFilePicker(input) {
  if (!input) {
    return false;
  }

  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker();
      return true;
    } catch {
      // Fall through to click for browsers that expose showPicker but reject it here.
    }
  }

  input.click();
  return true;
}

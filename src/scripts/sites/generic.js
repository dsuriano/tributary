// Generic fallback provider: use generic extraction when no specific site module matches.
const generic = {
  buttonSelector: ['button[aria-pressed="true"]', 'button[aria-checked="true"]', '[role="button"][aria-pressed="true"]'],
  containerSelector: ['article', 'main', 'body'],
  hooks: {
    // Leave hooks empty to rely on generic detection in content_script where applicable.
  }
};

export default generic;

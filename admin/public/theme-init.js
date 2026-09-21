(() => {
  let theme = 'light';
  try {
    const stored = localStorage.getItem('admin:theme');
    if (stored === 'dark' || stored === 'light') theme = stored;
    else if (matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark';
  } catch {
    if (matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark';
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();

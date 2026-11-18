/** « Pagne wax Élégance » devient « pagne-wax-elegance » : minuscules, sans accent, tirets. */
export const slugify = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);

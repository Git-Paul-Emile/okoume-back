/** Échappe les jokers de LIKE pour qu'une recherche « 50% » cherche bien le texte « 50% ». */
export const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

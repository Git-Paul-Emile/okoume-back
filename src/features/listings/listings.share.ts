import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { validate } from '../../core/middlewares/validate.js';
import { listingSlugParam } from './listings.schemas.js';
import type { ListingsService } from './listings.service.js';

/** Échappement HTML de toute valeur insérée dans la page : les textes viennent des vendeurs. */
const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/**
 * Page d'aperçu d'un lien partagé (32.9) : les réseaux sociaux lisent ses balises Open Graph (titre, photo, prix),
 * le visiteur est aussitôt redirigé vers l'annonce sur le site. Aucun script : une simple redirection HTML.
 */
function previewPage(preview: { title: string; description: string; image: string | null; url: string }) {
  const meta = [
    ['og:type', 'product'],
    ['og:site_name', 'Okoumé'],
    ['og:title', preview.title],
    ['og:description', preview.description],
    ['og:url', preview.url],
    ...(preview.image ? [['og:image', preview.image]] : []),
  ]
    .map(([property, content]) => `<meta property="${property}" content="${escapeHtml(content!)}">`)
    .join('\n    ');
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(preview.title)}</title>
    <meta name="description" content="${escapeHtml(preview.description)}">
    ${meta}
    <link rel="canonical" href="${escapeHtml(preview.url)}">
    <meta http-equiv="refresh" content="0; url=${escapeHtml(preview.url)}">
  </head>
  <body>
    <p><a href="${escapeHtml(preview.url)}">Voir l’annonce sur Okoumé</a></p>
  </body>
</html>`;
}

/** Liens partagés, sous /partage/annonces/:slug, hors de /api/v1 : une page pour les robots des réseaux sociaux. */
export const createSharePreviewRoutes = (service: ListingsService) => {
  const router = Router();
  router.get(
    '/partage/annonces/:slug',
    validate({ params: listingSlugParam }),
    asyncHandler(async (req: Request, res: Response) => {
      const preview = await service.sharePreview(String(req.params.slug));
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.type('html').send(previewPage(preview));
    }),
  );
  return router;
};

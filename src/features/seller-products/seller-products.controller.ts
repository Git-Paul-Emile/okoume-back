import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listSellerProductsQuery } from './seller-products.schemas.js';
import type { SellerProductsService } from './seller-products.service.js';

/** Le compte connecté est toujours le vendeur : aucun identifiant de boutique n'est lu dans la requête. */
export const createSellerProductsController = (service: SellerProductsService) => {
  const me = (req: Request) => req.customer!.id;
  const id = (req: Request) => String(req.params.id);
  const variantId = (req: Request) => String(req.params.variantId);
  return {
    list: async (req: Request, res: Response) =>
      sendSuccess(res, await service.list(me(req), listSellerProductsQuery.parse(req.query))),
    signPhotoUpload: async (req: Request, res: Response) => sendSuccess(res, await service.signPhotoUpload(me(req))),
    get: async (req: Request, res: Response) => sendSuccess(res, await service.get(me(req), id(req))),
    create: async (req: Request, res: Response) =>
      sendSuccess(res, await service.create(me(req), req.body), 201, 'Produit enregistré.'),
    update: async (req: Request, res: Response) =>
      sendSuccess(res, await service.update(me(req), id(req), req.body), 200, 'Produit modifié.'),
    submit: async (req: Request, res: Response) =>
      sendSuccess(res, await service.submit(me(req), id(req)), 200, 'Produit soumis à la vérification.'),
    withdraw: async (req: Request, res: Response) =>
      sendSuccess(res, await service.withdraw(me(req), id(req)), 200, 'Produit retiré de la vente.'),
    addVariant: async (req: Request, res: Response) =>
      sendSuccess(res, await service.addVariant(me(req), id(req), req.body), 201, 'Variante ajoutée.'),
    updateVariant: async (req: Request, res: Response) =>
      sendSuccess(
        res,
        await service.updateVariant(me(req), id(req), variantId(req), req.body),
        200,
        'Variante modifiée.',
      ),
    setStock: async (req: Request, res: Response) =>
      sendSuccess(res, await service.setStock(me(req), id(req), variantId(req), req.body), 200, 'Stock mis à jour.'),
  };
};

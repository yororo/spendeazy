import { OpenApiDocumentService } from './openapi-document.service';

describe('OpenApiDocumentService', () => {
  it('lazily creates and reuses one factory document promise', async () => {
    const service = new OpenApiDocumentService();

    const firstDocument = service.getDocument();
    const secondDocument = service.getDocument();

    expect(firstDocument).toBe(secondDocument);
    await expect(firstDocument).resolves.toMatchObject({
      openapi: '3.0.3',
      info: { version: '1.0.0' },
    });
  });
});

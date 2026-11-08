const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const storedImage = new RegExp(`^${uuid}/${uuid}\\.(png|jpe?g|webp)$`);
const demoImage = new RegExp(`^demo-menu:${uuid}$`);

export function isUploadedMenuImage(path: string) {
  return storedImage.test(path) || demoImage.test(path);
}

export function menuImageBelongsToShop(path: string, shopId: string) {
  return storedImage.test(path) && path.startsWith(`${shopId}/`);
}

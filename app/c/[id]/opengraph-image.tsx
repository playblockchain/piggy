import { loadCard } from "@/lib/card-store";
import { renderCardImage, size, contentType, alt } from "@/app/card-image";

export { size, contentType, alt };

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  return renderCardImage(await loadCard((await params).id));
}

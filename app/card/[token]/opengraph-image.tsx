import { decodeCard } from "@/lib/card-token";
import { renderCardImage, size, contentType, alt } from "@/app/card-image";

export { size, contentType, alt };

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  return renderCardImage(decodeCard((await params).token));
}

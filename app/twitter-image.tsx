// The same card as the Open Graph image. Next.js 16 reads route settings such as `dynamic`
// straight from this file, so they are declared here rather than re-exported.
export { default, alt, size, contentType } from "./opengraph-image";
export const dynamic = "force-static";

import type { ImageSourceInfo } from './types';

/**
 * Analyzes an image URL to determine its hosting provider, confidence score, and documentation link.
 * Supports 12 explicit providers: Unsplash, Pexels, Cloudinary, Imgix, Shopify CDN, Contentful,
 * Sanity, Prismic, Firebase Storage, Amazon S3, Vercel Blob, and Cloudflare Images.
 * If unknown, returns 'Custom Hosted'.
 */
export function detectImageSource(url: string): ImageSourceInfo {
  if (!url) {
    return { provider: 'Custom Hosted', confidence: 1.0 };
  }

  try {
    // Attempt to parse the URL
    // Handle cases where the URL is relative or is a local asset
    let parsedUrl: URL;
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      return { provider: 'Custom Hosted', confidence: 1.0 };
    }

    try {
      parsedUrl = new URL(url);
    } catch {
      // Fallback base URL for parsing relative paths
      const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
      parsedUrl = new URL(url, base);
      // If it's a relative path on localhost/custom domain, it is custom hosted
      if (parsedUrl.origin === base) {
        return { provider: 'Custom Hosted', confidence: 1.0 };
      }
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname;
    const searchParams = parsedUrl.searchParams;

    // 1. Unsplash
    if (hostname === 'images.unsplash.com' || hostname.endsWith('.unsplash.com')) {
      return {
        provider: 'Unsplash',
        confidence: 1.0,
        documentationLink: 'https://unsplash.com/documentation'
      };
    }

    // 2. Pexels
    if (hostname === 'images.pexels.com' || hostname.endsWith('.pexels.com')) {
      return {
        provider: 'Pexels',
        confidence: 1.0,
        documentationLink: 'https://www.pexels.com/api/documentation/'
      };
    }

    // 3. Cloudinary
    if (hostname === 'res.cloudinary.com' || hostname.endsWith('.cloudinary.com') || pathname.includes('/image/upload/') || pathname.includes('/video/upload/')) {
      const isDomainMatch = hostname.includes('cloudinary.com');
      return {
        provider: 'Cloudinary',
        confidence: isDomainMatch ? 1.0 : 0.9,
        documentationLink: 'https://cloudinary.com/documentation'
      };
    }

    // 4. Imgix
    if (hostname.endsWith('imgix.net') || searchParams.has('ixlib')) {
      return {
        provider: 'Imgix',
        confidence: hostname.endsWith('imgix.net') ? 1.0 : 0.9,
        documentationLink: 'https://docs.imgix.com/'
      };
    }

    // 5. Shopify CDN
    if (hostname === 'cdn.shopify.com' || hostname.endsWith('.shopify.com')) {
      return {
        provider: 'Shopify CDN',
        confidence: 1.0,
        documentationLink: 'https://shopify.dev/docs/api/storefront'
      };
    }

    // 6. Contentful
    if (hostname === 'images.ctfassets.net' || hostname.endsWith('.ctfassets.net')) {
      return {
        provider: 'Contentful',
        confidence: 1.0,
        documentationLink: 'https://www.contentful.com/developers/docs/references/images-api/'
      };
    }

    // 7. Sanity
    if (hostname === 'cdn.sanity.io' || hostname.endsWith('.sanity.io')) {
      return {
        provider: 'Sanity',
        confidence: 1.0,
        documentationLink: 'https://www.sanity.io/docs/image-urls'
      };
    }

    // 8. Prismic
    if (hostname === 'images.prismic.io' || hostname.endsWith('.prismic.io')) {
      return {
        provider: 'Prismic',
        confidence: 1.0,
        documentationLink: 'https://prismic.io/docs'
      };
    }

    // 9. Firebase Storage
    if (hostname === 'firebasestorage.googleapis.com' || (hostname.includes('googleapis.com') && pathname.includes('/v0/b/'))) {
      const isDomainMatch = hostname === 'firebasestorage.googleapis.com';
      return {
        provider: 'Firebase Storage',
        confidence: isDomainMatch ? 1.0 : 0.85,
        documentationLink: 'https://firebase.google.com/docs/storage'
      };
    }

    // 10. Amazon S3
    // S3 hostnames can be:
    // - s3.amazonaws.com
    // - bucket-name.s3.amazonaws.com
    // - bucket-name.s3.region.amazonaws.com
    // - s3.region.amazonaws.com
    const s3Regex = /s3[.-]([a-z0-9-]+)?\.amazonaws\.com/i;
    if (hostname === 's3.amazonaws.com' || hostname.endsWith('.s3.amazonaws.com') || s3Regex.test(hostname)) {
      return {
        provider: 'Amazon S3',
        confidence: 1.0,
        documentationLink: 'https://aws.amazon.com/s3/'
      };
    }

    // 11. Vercel Blob
    if (hostname === 'public.blob.vercel-storage.com' || hostname.endsWith('.public.blob.vercel-storage.com')) {
      return {
        provider: 'Vercel Blob',
        confidence: 1.0,
        documentationLink: 'https://vercel.com/docs/storage/vercel-blob'
      };
    }

    // 12. Cloudflare Images
    if (hostname === 'imagedelivery.net' || hostname.endsWith('.imagedelivery.net') || pathname.includes('/cdn-cgi/image/')) {
      const isDomainMatch = hostname.includes('imagedelivery.net');
      return {
        provider: 'Cloudflare Images',
        confidence: isDomainMatch ? 1.0 : 0.95,
        documentationLink: 'https://developers.cloudflare.com/images/'
      };
    }

    return { provider: 'Custom Hosted', confidence: 1.0 };
  } catch {
    return { provider: 'Custom Hosted', confidence: 1.0 };
  }
}

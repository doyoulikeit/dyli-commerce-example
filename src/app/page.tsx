import { Storefront } from "@/components/storefront";
import { loadStorefront } from "@/lib/storefront-server";
import { storefrontConfig } from "@/config/storefront";
import { LiveStorefront } from "@/components/live-storefront";
import { Providers } from "@/components/providers";
import { loadCommerceRuntime } from "@/lib/runtime-server";
import { StorefrontSetup } from "@/components/storefront-setup";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const demo = storefrontConfig.demo.enabled || params.demo === "1";
  const [storefront, runtime] = await Promise.all([
    loadStorefront().catch(() => null),
    demo ? Promise.resolve(null) : loadCommerceRuntime().catch(() => null),
  ]);
  if (demo) return <Storefront initialStorefront={storefront} />;
  if (!runtime) return <StorefrontSetup />;
  return <Providers runtime={runtime}><LiveStorefront initialStorefront={storefront} /></Providers>;
}

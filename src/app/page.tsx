import { Storefront } from "@/components/storefront";
import { loadStorefront } from "@/lib/storefront-server";
import { storefrontConfig } from "@/config/storefront";
import { LiveStorefront } from "@/components/live-storefront";
import { Providers } from "@/components/providers";
import { loadCommerceRuntime } from "@/lib/runtime-server";
import { StorefrontSetup } from "@/components/storefront-setup";

export default async function Home() {
  const [storefront, runtime] = await Promise.all([
    loadStorefront().catch(() => null),
    storefrontConfig.demo.enabled ? Promise.resolve(null) : loadCommerceRuntime().catch(() => null),
  ]);
  if (storefrontConfig.demo.enabled) return <Storefront initialStorefront={storefront} />;
  if (!runtime) return <StorefrontSetup />;
  return <Providers runtime={runtime}><LiveStorefront initialStorefront={storefront} /></Providers>;
}

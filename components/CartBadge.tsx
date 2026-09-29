"use client";

import { useCartStore, totalItemsCount } from "@/lib/store";

export default function CartBadge() {
  const items = useCartStore((s) => s.items);
  const count = totalItemsCount(items);

  if (count <= 0) return null;

  return (
    <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[10px] font-bold">
      {count}
    </span>
  );
}

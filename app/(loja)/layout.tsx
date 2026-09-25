import Header from "@/components/Header";
import CartDrawer from "@/components/CartDrawer";
import NotificationToast from "@/components/NotificationToast";

export default function LojaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <CartDrawer />
      <NotificationToast />
      {children}
    </>
  );
}

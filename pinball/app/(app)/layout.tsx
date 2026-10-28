import { BottomNav } from '@/components/ui/BottomNav';

/** (app) 路由组布局：内容区 + 全局底部导航（pb-16 避遮挡） */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mx-auto w-full max-w-md min-h-screen pb-16">{children}</div>
      <BottomNav />
    </>
  );
}

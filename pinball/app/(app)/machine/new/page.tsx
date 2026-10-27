import { MachineForm } from '@/components/machine/MachineForm';

export const dynamic = 'force-dynamic';

export default function NewMachinePage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-5 space-y-4">
      <h1 className="text-xl font-bold">新建机台</h1>
      <MachineForm />
    </main>
  );
}

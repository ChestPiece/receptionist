import { desk } from "@/lib/dashboard";
import { PageBody, PageHeader } from "../page-frame";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Account" };

export default async function Account() {
  const { email, clinic } = await desk();
  return (
    <>
      <PageHeader title="Account" />
      <PageBody className="overflow-y-auto p-3 sm:p-4">
        <div className="grid w-full max-w-md gap-4">
          <section className="slip grid gap-1 p-4">
            <h2 className="text-sm font-semibold">Signed in as</h2>
            <p className="truncate text-sm">{email}</p>
            {clinic && <p className="text-xs text-muted-foreground">{clinic.role === "owner" ? "Owner" : "Staff"} at {clinic.name}</p>}
          </section>
          <section className="slip grid gap-3 p-4">
            <h2 className="text-sm font-semibold">Change password</h2>
            <PasswordForm />
          </section>
        </div>
      </PageBody>
    </>
  );
}

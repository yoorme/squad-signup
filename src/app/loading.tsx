import { Loading } from "@/components/ui/StateView";

export default function GlobalLoading() {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Loading />
    </div>
  );
}

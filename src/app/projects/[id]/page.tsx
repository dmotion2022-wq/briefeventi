import { redirect } from "next/navigation";

export default async function ProjectIndex(props: PageProps<"/projects/[id]">) {
  const { id } = await props.params;
  redirect(`/projects/${id}/brief`);
}

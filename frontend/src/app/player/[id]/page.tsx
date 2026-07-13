import { Metadata } from "next";
import PlayerDetail from "./PlayerDetail";
type PageProps = {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return {
    title: `Player ${params.id}`,
  };
}

export default function PlayerDetailPage({ params }: PageProps) {
  return <PlayerDetail params={params} />;
}

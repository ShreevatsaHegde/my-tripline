import { useQuery } from "@tanstack/react-query";
import { signedPhotoUrl } from "@/lib/trip-api";

export function PhotoImage({
  path,
  alt,
  className,
}: {
  path: string;
  alt: string;
  className?: string;
}) {
  const { data } = useQuery({
    queryKey: ["photo", path],
    queryFn: () => signedPhotoUrl(path),
    staleTime: 1000 * 60 * 30,
  });

  if (!data) {
    return <div className={`animate-pulse rounded-lg bg-muted ${className ?? ""}`} />;
  }

  return <img src={data} alt={alt} className={className} loading="lazy" />;
}

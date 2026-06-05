type YouTubePlayerProps = {
  youtubeId: string
  title: string
  autoplay?: boolean
}

export function YouTubePlayer({ youtubeId, title, autoplay = false }: YouTubePlayerProps) {
  const params = `rel=0&modestbranding=1${autoplay ? '&autoplay=1' : ''}`
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-canvas shadow-crate">
      <iframe
        className="aspect-video w-full"
        src={`https://www.youtube.com/embed/${youtubeId}?${params}`}
        title={title}
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  )
}

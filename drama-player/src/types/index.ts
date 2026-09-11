export interface Drama {
  sourceId: string;
  sourceDramaId: string;
  title: string;
  poster: string;
  description: string;
  genres: string[];
  tags: string[];
  languageCode: string;
  score: number;
}

export interface Episode {
  episodeNumber: number;
  title: string;
  isVip: boolean;
  sourceEpisodeId: string;
  streamUrl: string | null;
  qualities: Quality[];
  subtitles: Subtitle[];
}

export interface Quality {
  url: string;
  resolution: string;
  codec: string;
  format: string;
}

export interface Subtitle {
  url: string;
  language: string;
}

export interface DramaDetail extends Drama {
  episodes: Episode[];
  totalEpisodes: number;
  freeCount: number;
}

import type { Subtitle } from "@/lib/idlix";

export interface MovieDetail {
  id: string;
  title: string;
  slug: string;
  posterPath: string;
  backdropPath: string;
  releaseDate: string;
  voteAverage: string;
  runtime: number;
  quality: string;
  country: string;
  overview: string;
  director: string;
  genres: { id: string; name: string }[];
  cast: { id: string; name: string; character: string; profilePath: string | null }[];
  contentType: string;
  isSeries?: boolean;
  numberOfSeasons?: number;
}

export interface MovieListItem {
  id: string;
  title: string;
  slug: string;
  posterPath: string;
  backdropPath: string;
  releaseDate: string;
  voteAverage: string;
  quality: string;
  country: string;
  runtime: number;
  genres: { id: string; name: string }[];
  hasVideo: boolean;
  isSeries?: boolean;
  overview?: string;
}

export interface SearchResult {
  id: string;
  contentType: string;
  title: string;
  overview: string;
  releaseDate?: string;
  posterPath?: string;
  slug?: string;
  genres?: string[];
  voteAverage?: string;
}

export { yearOf } from "./media";

export type { Subtitle };
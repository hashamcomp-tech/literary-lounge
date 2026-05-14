export type Genre = {
  id: string;
  name: string;
  category: "fiction" | "non_fiction";
  subGenres?: string[];
};

export const GENRES: Genre[] = [
  {
    id: "fiction",
    name: "Fiction",
    category: "fiction",
    subGenres: [
      "Fantasy",
      "Science Fiction",
      "Mystery",
      "Thriller",
      "Horror",
      "Romance",
      "Historical Fiction",
      "Dystopian",
      "Adventure",
      "Crime",
      "Contemporary",
      "Drama",
      "Satire"
    ],
  },
  {
    id: "non_fiction",
    name: "Non-Fiction",
    category: "non_fiction",
    subGenres: [
      "Biography",
      "Memoir",
      "Self Help",
      "Business",
      "Philosophy",
      "Psychology",
      "History",
      "Science",
      "Spirituality",
      "Humor"
    ],
  },
  {
    id: "special",
    name: "Special Categories",
    category: "fiction",
    subGenres: [
      "Poetry",
      "Graphic Novel",
      "Young Adult",
      "Children's",
      "Classic"
    ],
  }
];

// Flat array of all genre strings for UI components
export const ALL_GENRES: string[] = GENRES.flatMap(category => category.subGenres || []);
import { PlaceHolderImages } from './placeholder-images';

export interface Chapter {
  id: string;
  title: string;
  content: string;
}

export interface Novel {
  id: string;
  title: string;
  author: string;
  genre: string;
  summary: string;
  coverImage: string;
  chapters: Chapter[];
}

const generateChapters = (novelTitle: string): Chapter[] => {
  return Array.from({ length: 10 }, (_, i) => ({
    id: `ch-${i + 1}`,
    title: `Chapter ${i + 1}: ${novelTitle} Part ${i + 1}`,
    content: `This is the immersive content of chapter ${i + 1} for the novel titled "${novelTitle}". \n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.\n\nSed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.\n\nNeque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur? Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur?`
  }));
};

export const MOCK_NOVELS: Novel[] = [
  {
    id: '1',
    title: 'The Whispering Woods',
    author: 'Elena Vance',
    genre: 'Fantasy',
    summary: 'A young scholar discovers that the forest surrounding her village holds secrets older than time itself, and it has started to speak.',
    coverImage: PlaceHolderImages[0].imageUrl,
    chapters: generateChapters('The Whispering Woods'),
  },
  {
    id: '2',
    title: 'Beyond the Azure Sky',
    author: 'Marcus Thorne',
    genre: 'Sci-Fi',
    summary: 'In a world where the sky has turned permanently blue, one pilot ventures beyond the atmosphere to find what was lost.',
    coverImage: PlaceHolderImages[1].imageUrl,
    chapters: generateChapters('Beyond the Azure Sky'),
  },
  {
    id: '3',
    title: 'Echoes of the Past',
    author: 'Sarah Jenkins',
    genre: 'Historical Fiction',
    summary: 'A meticulously researched tale of love and betrayal set in the heart of Victorian London during the industrial revolution.',
    coverImage: PlaceHolderImages[2].imageUrl,
    chapters: generateChapters('Echoes of the Past'),
  },
  {
    id: '4',
    title: 'Crimson Moonlight',
    author: 'Julian Black',
    genre: 'Mystery',
    summary: 'A detective with a troubled past must solve a series of unusual crimes that only occur during the red moon phases.',
    coverImage: PlaceHolderImages[3].imageUrl,
    chapters: generateChapters('Crimson Moonlight'),
  },
  {
    id: '5',
    title: 'The Clockwork Heart',
    author: 'Lillian Wright',
    genre: 'Steampunk',
    summary: 'An orphan engineer creates a heart for a broken automaton, unintentionally sparking a revolution in a city of gears.',
    coverImage: PlaceHolderImages[4].imageUrl,
    chapters: generateChapters('The Clockwork Heart'),
  },
  {
    id: '6',
    title: 'Midnight Tea',
    author: 'Oliver Smith',
    genre: 'Contemporary',
    summary: 'A quiet story about a small-town cafe owner who finds magic in the ordinary lives of his nocturnal customers.',
    coverImage: PlaceHolderImages[5].imageUrl,
    chapters: generateChapters('Midnight Tea'),
  }
];

export const getNovelById = (id: string) => MOCK_NOVELS.find(n => n.id === id);
export const searchNovels = (query: string) => 
  MOCK_NOVELS.filter(n => 
    n.title.toLowerCase().includes(query.toLowerCase()) || 
    n.author.toLowerCase().includes(query.toLowerCase()) ||
    n.genre.toLowerCase().includes(query.toLowerCase())
  );
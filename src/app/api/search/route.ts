import { NextRequest, NextResponse } from 'next/server';
import algoliasearch from 'algoliasearch';

const client = algoliasearch(
  process.env.ALGOLIA_APP_ID!,
  process.env.ALGOLIA_ADMIN_KEY!
);

const index = client.initIndex('books');

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.get('q')?.trim();

    if (!query || query.length < 2) {
      return NextResponse.json({
        results: [],
        suggestions: [],
      });
    }

    const result = await index.search(query, {
      hitsPerPage: 24,

      attributesToRetrieve: [
        'objectID',
        'title',
        'author',
        'genre',
        'coverImage',
        'popularity',
      ],

      typoTolerance: true,

      ignorePlurals: true,

      removeStopWords: true,

      queryLanguages: ['en'],

      advancedSyntax: true,

      analytics: true,

      clickAnalytics: true,
    });

    const hits = result.hits.map((hit: any) => ({
      id: hit.objectID,
      title: hit.title,
      author: hit.author,
      genre: hit.genre,
      coverImage: hit.coverImage,
      popularity: hit.popularity || 0,
    }));

    const suggestions = hits.slice(0, 6).map((hit: any) => ({
      id: hit.id,
      title: hit.title,
      author: hit.author,
    }));

    return NextResponse.json(
      {
        results: hits,
        suggestions,
      },
      {
        headers: {
          'Cache-Control':
            'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: 'Search failed',
      },
      {
        status: 500,
      }
    );
  }
}
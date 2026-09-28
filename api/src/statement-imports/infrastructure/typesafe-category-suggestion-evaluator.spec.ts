import type { Fetch } from '@typesafe-ai/sdk';
import { TypeSafeCategorySuggestionEvaluator } from './typesafe-category-suggestion-evaluator';

describe('TypeSafeCategorySuggestionEvaluator', () => {
  const categories = [
    { id: '42', name: 'Groceries', description: 'Food and household supplies' },
    { id: '43', name: 'Transport', description: null },
  ];

  it('sends only the description and active Category context in a typed Choice request', async () => {
    const fetch = createFetchResponse('42', {
      '42': 0.8,
      '43': 0.1,
      none_of_the_above: 0.1,
    });
    const evaluator = new TypeSafeCategorySuggestionEvaluator(
      'server-secret',
      fetch,
    );

    await expect(
      evaluator.suggestCategory('Market purchase', categories),
    ).resolves.toBe('42');

    const [url, requestInit] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(requestInit?.headers).toMatchObject({
      Authorization: 'Bearer server-secret',
    });
    const requestBody = requestInit?.body;
    if (typeof requestBody !== 'string') {
      throw new Error('TypeSafe SDK request body was not serialized JSON.');
    }
    const request = JSON.parse(requestBody) as {
      model: string;
      state: Record<string, unknown>;
      questions: Record<
        string,
        { type: string; criteria: Record<string, unknown> }
      >;
    };
    expect(request.model).toBe('jev-latest');
    expect(request.state).toEqual({
      transactionDescription: 'Market purchase',
      activeCategories: [
        {
          id: '42',
          name: 'Groceries',
          description: 'Food and household supplies',
        },
        { id: '43', name: 'Transport' },
      ],
    });
    const suggestionQuestion = request.questions.suggestedCategory;
    expect(suggestionQuestion.type).toBe('choice');
    expect(Object.keys(suggestionQuestion.criteria).sort()).toEqual([
      '42',
      '43',
      'none_of_the_above',
    ]);
    expect(suggestionQuestion.criteria['42']).toBeNull();
    expect(suggestionQuestion.criteria['43']).toBeNull();
    expect(typeof suggestionQuestion.criteria.none_of_the_above).toBe('string');
    expect(JSON.stringify(request)).not.toMatch(
      /amount|date|account|reference|statement text/iu,
    );
  });

  it('returns no suggestion when none of the active Categories is selected', async () => {
    const fetch = createFetchResponse('none_of_the_above', {
      '42': 0.25,
      '43': 0.25,
      none_of_the_above: 0.5,
    });
    const evaluator = new TypeSafeCategorySuggestionEvaluator(
      'server-secret',
      fetch,
    );

    await expect(
      evaluator.suggestCategory('Unclear purchase', categories),
    ).resolves.toBeNull();
  });

  it('rejects a distribution that includes Categories outside the active Choice', async () => {
    const fetch = createFetchResponse('42', {
      '42': 0.7,
      '43': 0.1,
      '99': 0.1,
      none_of_the_above: 0.1,
    });
    const evaluator = new TypeSafeCategorySuggestionEvaluator(
      'server-secret',
      fetch,
    );

    await expect(
      evaluator.suggestCategory('Market purchase', categories),
    ).resolves.toBeNull();
  });

  it('returns no suggestion if the TypeSafe service is not configured or fails', async () => {
    const fetch = jest.fn<ReturnType<Fetch>, Parameters<Fetch>>();
    const unconfigured = new TypeSafeCategorySuggestionEvaluator(
      undefined,
      fetch,
    );
    const unavailable = new TypeSafeCategorySuggestionEvaluator(
      'server-secret',
      jest
        .fn<ReturnType<Fetch>, Parameters<Fetch>>()
        .mockRejectedValue(new Error('offline')),
    );

    await expect(
      unconfigured.suggestCategory('Market purchase', categories),
    ).resolves.toBeNull();
    await expect(
      unavailable.suggestCategory('Market purchase', categories),
    ).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

function createFetchResponse(
  choice: string,
  probabilities: Record<string, number>,
) {
  return jest.fn<ReturnType<Fetch>, Parameters<Fetch>>().mockResolvedValue(
    new Response(
      JSON.stringify({
        model: 'jev-1.13.0',
        answers: {
          suggestedCategory: {
            type: 'choice',
            choice,
            probabilities,
            confidence: 0.7,
          },
        },
        usage: { input_tokens: 100, output_tokens: 10 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
}

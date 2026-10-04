export class AiRefusalError extends Error {
  constructor(message = 'The model declined to answer.') {
    super(message);
    this.name = 'AiRefusalError';
  }
}

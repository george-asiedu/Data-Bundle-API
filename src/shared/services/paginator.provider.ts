import { Injectable } from '@nestjs/common';

/**
 * This class supports all pagination process of all entities
 * It contains the necessary data to support the pagination process
 */
export class Paginator {
  perPage: number;
  page: number;
  query: string;
}

/**
 * A builder pattern, that creates a paginator needed to handle all pagination of entities by
 * ensuring the received data such as query, perpage and page string
 * values are converted to the right data types to eliminate errors
 * and ensure correctness of the implementation of the pagination process
 */
@Injectable()
export class PaginatorBuilder {
  private readonly _paginator: Paginator;
  private PER_PAGE_DEFAULT = 10;
  private PAGE_DEFAULT = 0;

  constructor() {
    this._paginator = new Paginator();
  }

  /**
   * Returns a converted a string value to a number,
   * if it fails, it returns a defaultValue instead
   */
  private _convertToNumber(value: string, defaultValue: number): number {
    const parsedValue = parseInt(value);

    if (Number.isNaN(parsedValue)) {
      return defaultValue;
    }

    return parsedValue;
  }

  /**
   * Receives a string perPage value and converts it to a number
   * as well as passing it onto the paginator object
   * @param {string} perPage
   * @returns
   */
  setPerPage(perPage: string): PaginatorBuilder {
    this._paginator.perPage = this._convertToNumber(
      perPage,
      this.PER_PAGE_DEFAULT,
    );

    return this;
  }

  /**
   * Receives a string page value and converts it to a number
   * as well as passing it onto the paginator object
   * @param {string} page
   * @returns
   */
  setPage(page: string): PaginatorBuilder {
    this._paginator.page = this._convertToNumber(page, this.PAGE_DEFAULT);
    return this;
  }

  /**
   * Receives a searched query string and
   * passes it onto the paginator object
   * @param {string} query
   * @returns
   */
  setQuery(query: string): PaginatorBuilder {
    this._paginator.query = !query ? '' : query;
    return this;
  }

  /**
   * This function is to be called last to ensure to return the paginator
   * after receiving all the required data
   */
  getResult(): Paginator {
    return this._paginator;
  }
}

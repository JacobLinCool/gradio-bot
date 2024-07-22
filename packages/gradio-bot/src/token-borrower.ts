import { Client } from "@gradio/client";

export class TokenBorrower {
	constructor(private gr?: Client) {}

	static async create(proxy?: string): Promise<TokenBorrower> {
		const gr = proxy ? await Client.connect(proxy) : undefined;
		return new TokenBorrower(gr);
	}

	decorate(gr: Client): void {
		if (!this.gr) {
			return;
		}

		// @ts-expect-error
		if (gr.__token_borrower__) {
			return;
		}

		gr.fetch = (
			(f: Client["fetch"]) =>
			async (...args: Parameters<typeof f>) => {
				if (!this.gr) {
					return f(...args);
				}

				if (!args[1]) {
					args[1] = {};
				}

				if (!args[1].headers) {
					args[1].headers = {};
				}

				try {
					const res = await this.gr.predict("/predict", []);
					const [token] = res.data as [string];
					if (token) {
						if (args[1].headers instanceof Headers) {
							args[1].headers.set("X-IP-Token", token);
						} else if (Array.isArray(args[1].headers)) {
							args[1].headers.push(["X-IP-Token", token]);
						} else {
							args[1].headers["X-IP-Token"] = token;
						}
					}
				} catch {}

				return f(...args);
			}
		)(gr.fetch.bind(gr));

		// @ts-expect-error
		gr.__token_borrower__ = true;
	}
}

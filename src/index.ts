import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export interface Env {
  MCP_OBJECT: DurableObjectNamespace;
}

export class WeatherMCP extends McpAgent<Env> {
  server = new McpServer({ name: "weather", version: "1.0.0" });

  async init() {
    this.server.tool(
      "get_weather",
      "Get the current weather for a city",
      { city: z.string().describe("City name") },
      async ({ city }) => {
        // Step 1: Geocode city name → coordinates
        const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
        geoUrl.searchParams.set("name", city);
        geoUrl.searchParams.set("count", "1");
        geoUrl.searchParams.set("language", "de");
        geoUrl.searchParams.set("format", "json");

        const geoRes = await fetch(geoUrl.toString());
        const geoData = (await geoRes.json()) as { results?: { name: string; country: string; latitude: number; longitude: number }[] };

        if (!geoData.results?.length) {
          return { content: [{ type: "text", text: `City '${city}' not found.` }] };
        }

        const { name, country, latitude, longitude } = geoData.results[0];

        // Step 2: Fetch current weather
        const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
        weatherUrl.searchParams.set("latitude", String(latitude));
        weatherUrl.searchParams.set("longitude", String(longitude));
        weatherUrl.searchParams.set("current", "temperature_2m,weather_code");
        weatherUrl.searchParams.set("timezone", "Europe/Berlin");

        const weatherRes = await fetch(weatherUrl.toString());
        const weatherData = (await weatherRes.json()) as {
          current: { temperature_2m: number; weather_code: number };
        };

        const { temperature_2m, weather_code } = weatherData.current;

        const wmoDescriptions: Record<number, string> = {
          0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
          45: "Foggy", 48: "Icy fog",
          51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
          61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
          71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
          80: "Slight showers", 81: "Moderate showers", 82: "Violent showers",
          95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
        };

        const condition = wmoDescriptions[weather_code] ?? `Weather code ${weather_code}`;
        const temp = Math.round(temperature_2m);

        return {
          content: [{
            type: "text",
            text: `Weather in ${name}, ${country}:\n  Condition:    ${condition}\n  Temperature:  ${temp} °C`,
          }],
        };
      }
    );
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === "/mcp") {
      return WeatherMCP.serve("/mcp").fetch(request, env, ctx);
    }
    return new Response("Weather MCP Server", { status: 200 });
  },
};

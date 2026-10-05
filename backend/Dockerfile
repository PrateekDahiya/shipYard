FROM node:20-alpine
# git is required: commit-SHA resolution shells out to `git ls-remote`
RUN apk add --no-cache git
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY migrations ./migrations
EXPOSE 4000
CMD ["node", "src/server.js"]

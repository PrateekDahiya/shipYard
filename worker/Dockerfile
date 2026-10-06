FROM node:20-alpine
# git is required: the pipeline shells out to `git clone` / `git checkout`
RUN apk add --no-cache git
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
CMD ["node", "src/index.js"]

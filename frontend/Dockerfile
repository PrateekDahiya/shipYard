FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Next evaluates rewrites during `next build`, so the internal backend target
# must be available as a build-time value, not only as a runtime container env.
ARG BACKEND_INTERNAL_URL=
ENV BACKEND_INTERNAL_URL=$BACKEND_INTERNAL_URL
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

<<<<<<< HEAD
# Build-time arg so Next.js bakes the API URL into the bundle
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
=======
RUN npm run build

CMD ["npm", "start"]
>>>>>>> 6b324e2a39decd8274cede4cf62e93ef81993c9b

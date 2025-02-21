import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

let isPublicRoute = createRouteMatcher(['/sign-in', '/sign-up']);

export default clerkMiddleware((auth, request) => {
    if (!isPublicRoute(request)) {
        auth().protect();
    }
});

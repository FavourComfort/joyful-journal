import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/booking/$id')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello booking details!</div>
}

import {
  InvitePage, generateInviteMetadata, type InvitePageProps,
} from "@/modules/wallets/public.server"

export const generateMetadata = generateInviteMetadata

export default function Page(props: InvitePageProps) {
  return <InvitePage {...props} />
}

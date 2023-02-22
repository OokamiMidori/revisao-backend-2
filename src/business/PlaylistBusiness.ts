import { PlaylistDatabase } from "../database/PlaylistDatabase";
import { CreatePlaylistInputDTO, DeletePlaylistInputDTO, EditPlaylistInputDTO, GetPlaylistsInputDTO, GetPlaylistsOutputDTO, LikeOrDislikePlaylistInputDTO } from "../dtos/userDTO";
import { BadRequestError } from "../errors/BadRequestError";
import { NotFoundError } from "../errors/NotFoundError";
import { Playlist } from "../models/Playlist";
import { IdGenerator } from "../services/IdGenerator";
import { TokenManager } from "../services/TokenManager";
import { LikeDislikeDB, PlaylistDB, PlaylistWithCreatorDB, PLAYLIST_LIKE, USER_ROLES } from "../types";

export class PlaylistBusiness {
    constructor(
        private playlistDatabase: PlaylistDatabase,
        private idGenerator: IdGenerator,
        private tokenManager: TokenManager
    ) { }

    public getPlaylists = async (input: GetPlaylistsInputDTO): Promise<GetPlaylistsOutputDTO> => {
        const { token } = input

        if (!token) {
            throw new BadRequestError("token ausente")
        }

        const payload = this.tokenManager.getPayload(token)

        if (!payload) {
            throw new BadRequestError("token inválido")
        }

        const playlistsWhitCreatorsDB: PlaylistWithCreatorDB[] =
            await this.playlistDatabase
                .getPlaylistsWithCreators()

        const playlists = playlistsWhitCreatorsDB.map((playlistWhitCreatorDB) => {
            const playlist = new Playlist(
                playlistWhitCreatorDB.id,
                playlistWhitCreatorDB.name,
                playlistWhitCreatorDB.likes,
                playlistWhitCreatorDB.dislikes,
                playlistWhitCreatorDB.created_at,
                playlistWhitCreatorDB.updated_at,
                playlistWhitCreatorDB.creator_id,
                playlistWhitCreatorDB.creator_name
            )
            return playlist.toBusinessModel()
        })

        return playlists
    }

    public createPlaylist = async (input: CreatePlaylistInputDTO): Promise<void> => {
        const { token, name } = input

        if (!token) {
            throw new BadRequestError("token ausente")
        }

        const payload = this.tokenManager.getPayload(token)

        if (!payload) {
            throw new BadRequestError("token inválido")
        }

        if (typeof name !== "string") {
            throw new BadRequestError("'name' deve ser string")
        }

        const id = this.idGenerator.generate()
        const createdAt = new Date().toISOString()
        const updatedAt = new Date().toISOString()
        const creatorId = payload.id
        const creatorName = payload.name


        const playlist = new Playlist(
            id,
            name,
            0,
            0,
            createdAt,
            updatedAt,
            creatorId,
            creatorName
        )

        const playlistDB = playlist.toDBModel()

        await this.playlistDatabase.insert(playlistDB)
    }

    public editPlaylist = async (input: EditPlaylistInputDTO): Promise<void> => {
        const { token, name, idToEdit } = input

        if (!token) {
            throw new BadRequestError("token ausente")
        }

        const payload = this.tokenManager.getPayload(token)

        if (!payload) {
            throw new BadRequestError("token inválido")
        }

        if (typeof name !== "string") {
            throw new BadRequestError("'name' deve ser string")
        }

        const playlistDB: PlaylistDB | undefined = await this.playlistDatabase.findById(idToEdit)

        if (!playlistDB) {
            throw new NotFoundError("'id' não encontrado")
        }

        const creatorId = payload.id

        if (playlistDB.creator_id !== creatorId) {
            throw new BadRequestError("Somente quem criou a playlist pode editá-la")
        }

        const creatorName = payload.name


        const playlist = new Playlist(
            playlistDB.id,
            playlistDB.name,
            playlistDB.likes,
            playlistDB.dislikes,
            playlistDB.created_at,
            playlistDB.updated_at,
            creatorId,
            creatorName
        )

        playlist.setName(name)

        playlist.setUpdatedAt(new Date().toISOString())
        const updatedPlaylistDB = playlist.toDBModel()

        await this.playlistDatabase.update(idToEdit, updatedPlaylistDB)
    }

    public deletePlaylist = async (input: DeletePlaylistInputDTO): Promise<void> => {
        const { token, idToDelete } = input

        if (!token) {
            throw new BadRequestError("token ausente")
        }

        const payload = this.tokenManager.getPayload(token)

        if (!payload) {
            throw new BadRequestError("token inválido")
        }

        const playlistDB: PlaylistDB | undefined = await this.playlistDatabase.findById(idToDelete)

        if (!playlistDB) {
            throw new NotFoundError("'id' não encontrado")
        }

        const creatorId = payload.id

        if (payload.role !== USER_ROLES.ADMIN
            && playlistDB.creator_id !== creatorId) {
            throw new BadRequestError("Somente quem criou a playlist pode deletá-la")
        }

        await this.playlistDatabase.delete(idToDelete)
    }

    public likeOrDislikePlaylist = async (input: LikeOrDislikePlaylistInputDTO): Promise<void> => {
        const { token, idToLikeOrDislike, like } = input

        if (!token) {
            throw new BadRequestError("token ausente")
        }

        const payload = this.tokenManager.getPayload(token)

        if (!payload) {
            throw new BadRequestError("token inválido")
        }

        if (typeof like !== "boolean") {
            throw new BadRequestError("'like' deve ser boolean")
        }

        const playlistWithCreatorDB = await this.playlistDatabase
            .findPlaylistsWithCreatorsById(idToLikeOrDislike)

        if (!playlistWithCreatorDB) {
            throw new NotFoundError("'id' não encontrado")
        }

        const userId = payload.id
        const likeSQLite = like ? 1 : 0

        const likeDislikeDB: LikeDislikeDB = {
            user_id: userId,
            playlist_id: playlistWithCreatorDB.id,
            like: likeSQLite
        }

        const playlist = new Playlist(
            playlistWithCreatorDB.id,
            playlistWithCreatorDB.name,
            playlistWithCreatorDB.likes,
            playlistWithCreatorDB.dislikes,
            playlistWithCreatorDB.created_at,
            playlistWithCreatorDB.updated_at,
            playlistWithCreatorDB.creator_id,
            playlistWithCreatorDB.creator_name
        )

        const likeDislikeExists = await this.playlistDatabase.findLikeDislike(likeDislikeDB)

        if (likeDislikeExists === PLAYLIST_LIKE.ALREADY_LIKED) {
           
            if(like){
                await this.playlistDatabase.removeLikeDislike(likeDislikeDB)
                playlist.removeLike()
            }else{
                await this.playlistDatabase.updateLikeDislike(likeDislikeDB)
                playlist.removeLike()
                playlist.addDislike()
            }

        } else if (likeDislikeExists === PLAYLIST_LIKE.ALREADY_DILIKED) {

            if(like){
              await this.playlistDatabase.updateLikeDislike(likeDislikeDB)
                playlist.removeDislikes()
                playlist.addLike()
            }else{
                await this.playlistDatabase.removeLikeDislike(likeDislikeDB)
                playlist.removeDislikes()
            }

        } else {
            await this.playlistDatabase.likeOrDislikePlaylist(likeDislikeDB)
         
            if (like) {
                playlist.addLike()
            } else {
                playlist.addDislike()
            }
        }
        
        const updatedPlaylistDB = playlist.toDBModel()

        await this.playlistDatabase.update(idToLikeOrDislike, updatedPlaylistDB)
    }
}
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { UserMetaEntity } from 'src/entities/user_meta.entity';
import { ImageEntity } from 'src/entities/image.entity';
import { appendUrlDomain } from './../../helper/index';
import { TagService } from './../tags/tag.service';
import { UserTagRelationshipsEntity } from 'src/entities/user_tags_relationships';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(UserMetaEntity)
    private readonly userMetaRepository: Repository<UserMetaEntity>,
    @InjectRepository(ImageEntity)
    private readonly imageRepository: Repository<ImageEntity>,
    private readonly tagService: TagService
  ) {}

  async createUser(data: any): Promise<UserEntity> {
    const { email, displayName, hashed, username } = data;
    const user = {
      userName: username,
      userEmail: email,
      displayName: displayName,
      userPass: hashed,
    };
    return await this.userRepository.save(user);
  }

  async updateAvatarUser(body: { userId: number; imageId: number }): Promise<any> {
    const user = await this.userRepository.findOne({ where: { id: body.userId } });
    if (!user) return null;
    const image = await this.imageRepository.findOne({ where: { id: body.imageId } });
    if (!image) throw new BadRequestException('Image not found!');
    const metafind = await this.userMetaRepository.findOne({
      where: { metaKey: 'profile_image', user: { id: body.userId } },
    });
    if (metafind) {
      await this.userMetaRepository.update({ id: metafind.id }, { metaValue: image.id.toString() });
      return { mid: metafind.id };
    }
    const meta = new UserMetaEntity();
    meta.user = user;
    meta.metaKey = 'profile_image';
    meta.metaValue = image.id.toString();
    const metaCreate = await this.userMetaRepository.save(meta);
    return { mid: metaCreate.id };
  }

  async updateBannerUser(body: { userId: number; imageId: number }): Promise<any> {
    const user = await this.userRepository.findOne({ where: { id: body.userId } });
    if (!user) return null;
    const image = await this.imageRepository.findOne({ where: { id: body.imageId } });
    if (!image) throw new BadRequestException('Image not found!');
    const metafind = await this.userMetaRepository.findOne({
      where: { metaKey: 'profile_banner', user: { id: body.userId } },
    });
    if (metafind) {
      await this.userMetaRepository.update({ id: metafind.id }, { metaValue: image.id.toString() });
      return { mid: metafind.id };
    }
    const meta = new UserMetaEntity();
    meta.user = user;
    meta.metaKey = 'profile_banner';
    meta.metaValue = image.id.toString();
    const metaCreate = await this.userMetaRepository.save(meta);
    return { mid: metaCreate.id };
  }

  async getUserProfile(userId: number): Promise<any> {
    const author = await this.userRepository
      .createQueryBuilder('user')
      .where('user.id = :userId', { userId: userId })
      .leftJoin(UserMetaEntity, 'um', 'um.user = user.id AND um.metaKey = :metaAvatarKey', {
        metaAvatarKey: 'profile_image',
      })
      .leftJoin(ImageEntity, 'imageAvatar', 'imageAvatar.id = uuid(um.metaValue)')
      .leftJoin(UserMetaEntity, 'um2', 'um2.user = user.id AND um2.metaKey = :metaBannerKey', {
        metaBannerKey: 'profile_banner',
      })
      .leftJoin(ImageEntity, 'imageBanner', 'imageBanner.id = uuid(um2.metaValue)')
      .select([
        'user.id as id',
        'user.userName as username',
        'user.userEmail as email',
        'user.displayName as display_name ',
        'imageAvatar.path as avatar',
        'imageBanner.path as banner',
      ])
      .getRawOne();
    if (!author) return null;
    return {
      ...author,
      avatar: author?.avatar ? appendUrlDomain(author?.avatar) : null,
      banner: author?.banner ? appendUrlDomain(author?.banner) : null,
    };
  }
  async getAuthorLogin(userId: number): Promise<any> {
    const author = await this.userRepository
      .createQueryBuilder('user')
      .leftJoin(UserMetaEntity, 'um', 'um.user = user.id AND um.metaKey = :metaKey', { metaKey: 'profile_image' })
      .where('user.id = :userId', { userId })
      .leftJoin(ImageEntity, 'image', 'image.id = uuid(um.metaValue)')
      .select([
        'user.id as id',
        'user.userName as username',
        'user.userEmail as email',
        'user.displayName as display_name ',
        'image.path as path',
      ])
      .getRawOne();
    return { ...author, avatar: author?.path ? appendUrlDomain(author?.path) : null };
  }
  async findUserByWhere(where: any): Promise<UserEntity> {
    const user = await this.userRepository.findOne({ where: where });
    return user;
  }

  async getPhotosOrderByUser(userId: number): Promise<any> {
    const data = await this.imageRepository.find({
      where: { authorId: userId },
      select: { id: true, path: true },
    });
    return data.map((item: ImageEntity) => ({
      id: item.id,
      url: item.path ? appendUrlDomain(item?.path) : null,
    }));
  }

  async setTagWithUser(userId: number, tags: string[]): Promise<any> {
    const user = await this.findUserByWhere({ id: userId });
    const tagEntities = await Promise.all(
      tags.map(async (tagName) => {
        const slug = tagName.slice(1);
        let tag = await this.tagService.findTagBySlug(slug);
        if (!tag) {
          tag = await this.tagService.createTagByName(tagName);
        }
        return tag;
      })
    );
    const tagRelations = (await this.tagService.getTagRelationshipByUser(user)) || [];
    const tagRelationMap = new Map(tagRelations.map((relation) => [relation.tag.id, relation]));

    tagEntities.forEach((tag) => {
      if (tagRelationMap.has(tag.id)) {
        const relation = tagRelationMap.get(tag.id);
        relation.score++;
      } else {
        const relation = new UserTagRelationshipsEntity();
        relation.user = user;
        relation.tag = tag;
        relation.score = 1;
        tagRelationMap.set(tag.id, relation);
        tagRelations.push(relation);
      }
    });

    user.tags = tagEntities;
    return await this.userRepository.save(user);
  }
}
